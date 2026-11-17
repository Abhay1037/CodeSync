import { Room } from '../models/Room.js';
import { env } from '../config/env.js';
import {
  DEFAULT_CODE,
  DEFAULT_FILES,
  DEFAULT_PANEL_FILES,
} from '../constants/events.js';

/**
 * roomService
 * -----------
 * Thin data-access layer over the Room collection. The realtime layer keeps
 * an in-memory hot cache (roomStore) and uses this module to persist to
 * MongoDB without blocking the socket loop.
 */

/** Keep the legacy `code` field in sync for older clients / migrations. */
function legacyCodeFromFiles(files) {
  return {
    left: files.find((file) => file.id === DEFAULT_PANEL_FILES.left)?.content ?? '',
    right: files.find((file) => file.id === DEFAULT_PANEL_FILES.right)?.content ?? '',
  };
}

/** Create the room if missing; attach owner + participant atomically. */
export async function ensureRoom({ roomId, ownerId, participantId }) {
  const setOnInsert = {
    roomId,
    code: { ...DEFAULT_CODE },
    files: DEFAULT_FILES.map((file) => ({ ...file })),
    panelFiles: { ...DEFAULT_PANEL_FILES },
  };
  if (ownerId) setOnInsert.owner = ownerId;

  const update = {
    $setOnInsert: setOnInsert,
    $set: { lastActiveAt: new Date() },
  };
  if (participantId) update.$addToSet = { participants: participantId };

  return Room.findOneAndUpdate({ roomId }, update, {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
  }).lean();
}

export async function getRoomState(roomId) {
  return Room.findOne({ roomId }).lean();
}

export async function listRoomsForUser(userId) {
  return Room.find({ $or: [{ owner: userId }, { participants: userId }] })
    .sort({ lastActiveAt: -1 })
    .limit(50)
    .lean();
}

/**
 * Membership check for a room. Rooms are only readable by their owner and the
 * people who have joined them (room ids are unguessable, but not a secret).
 */
export async function getRoomAccess(roomId, userId) {
  const room = await Room.findOne({ roomId }).select('owner participants').lean();
  if (!room) return { found: false, member: false };

  const uid = String(userId ?? '');
  const member =
    (room.owner && String(room.owner) === uid) ||
    (room.participants ?? []).some((id) => String(id) === uid);

  return { found: true, member };
}

/** Delete a room document (owner only - enforced by the caller). */
export async function deleteRoom(roomId) {
  return Room.deleteOne({ roomId });
}

/** Remove rooms that have been idle longer than `maxAgeDays`. */
export async function cleanupStaleRooms(maxAgeDays) {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
  const result = await Room.deleteMany({ lastActiveAt: { $lt: cutoff } });
  return result.deletedCount ?? 0;
}

export async function addParticipant(roomId, userId) {
  if (!userId) return;
  await Room.updateOne({ roomId }, { $addToSet: { participants: userId } });
}

export async function setLanguage(roomId, language) {
  await Room.updateOne({ roomId }, { $set: { language, lastActiveAt: new Date() } });
}

// --- Debounced file persistence -----------------------------------------
// Typing produces a flood of updates; we coalesce them into one DB write
// per room per PERSIST_DEBOUNCE_MS window.
const pending = new Map(); // roomId -> { timer, files, panelFiles }

export function saveFilesDebounced(roomId, files, panelFiles) {
  const existing = pending.get(roomId);
  if (existing) clearTimeout(existing.timer);

  const snapshotFiles = files.map((file) => ({ ...file }));
  const snapshotPanels = { ...panelFiles };

  const timer = setTimeout(() => {
    pending.delete(roomId);
    Room.updateOne(
      { roomId },
      {
        $set: {
          files: snapshotFiles,
          panelFiles: snapshotPanels,
          code: legacyCodeFromFiles(snapshotFiles),
          lastActiveAt: new Date(),
        },
      }
    ).catch((err) => console.error('[db] saveFiles failed:', err.message));
  }, env.persistDebounceMs);

  pending.set(roomId, { timer, files: snapshotFiles, panelFiles: snapshotPanels });
}

/** Force an immediate write (used on graceful shutdown). */
export async function flushPending() {
  const writes = [];
  for (const [roomId, { timer, files, panelFiles }] of pending) {
    clearTimeout(timer);
    writes.push(
      Room.updateOne(
        { roomId },
        {
          $set: {
            files,
            panelFiles,
            code: legacyCodeFromFiles(files),
            lastActiveAt: new Date(),
          },
        }
      )
    );
  }
  pending.clear();
  await Promise.allSettled(writes);
}
