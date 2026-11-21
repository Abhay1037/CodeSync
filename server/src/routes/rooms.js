import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';
import {
  cancelPendingSave,
  deleteRoom,
  ensureRoom,
  getRoomAccess,
  getRoomState,
  listRoomsForUser,
} from '../services/roomService.js';
import { evictRoom } from '../sockets/roomStore.js';
import { EVENTS } from '../constants/events.js';

export const roomsRouter = Router();

/** Room ids end up in URLs, so keep them to a friendly character set. */
const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;

/** Compact, URL-safe room id (8 hex chars). */
function generateRoomId() {
  return randomUUID().replace(/-/g, '').slice(0, 8);
}

/** Shape a room document for the client (no secrets involved). */
function toRoomSummary(room) {
  return {
    roomId: room.roomId,
    owner: room.owner ? room.owner.toString() : null,
    language: room.language,
    lastActiveAt: room.lastActiveAt,
    participants: (room.participants ?? []).map((id) => id.toString()),
    createdAt: room.createdAt,
  };
}

/** GET /api/rooms - rooms the current user owns or has joined. */
roomsRouter.get('/rooms', requireAuth, async (req, res, next) => {
  try {
    const rooms = await listRoomsForUser(req.user._id);
    res.json({ rooms: rooms.map(toRoomSummary) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/rooms - create a room (owner = current user). */
roomsRouter.post('/rooms', requireAuth, async (req, res, next) => {
  try {
    const requested = String(req.body?.roomId ?? '').trim();
    if (requested && !ROOM_ID_PATTERN.test(requested)) {
      return res.status(400).json({
        error: 'Room id must be 3-64 characters: letters, numbers, dashes or underscores.',
      });
    }
    const roomId = requested || generateRoomId();

    const existing = await getRoomState(roomId);
    if (existing) {
      return res.status(409).json({ error: `Room '${roomId}' already exists.` });
    }

    const room = await ensureRoom({
      roomId,
      ownerId: req.user._id,
      participantId: req.user._id,
    });

    return res.status(201).json({ room: toRoomSummary(room) });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/rooms/:roomId - full room state.
 * Private: only the owner and joined participants may read a room's files.
 */
roomsRouter.get('/rooms/:roomId', requireAuth, async (req, res) => {
  try {
    const access = await getRoomAccess(req.params.roomId, req.user._id);
    if (!access.found) return res.status(404).json({ error: 'Room not found.' });
    if (!access.member) {
      return res.status(403).json({ error: 'You are not a member of this room.' });
    }

    const room = await getRoomState(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found.' });

    return res.json({
      room: {
        ...toRoomSummary(room),
        files: room.files ?? [],
        panelFiles: room.panelFiles ?? { left: null, right: null },
      },
    });
  } catch (err) {
    return next(err);
  }
});

/** DELETE /api/rooms/:roomId - owner-only room deletion. */
roomsRouter.delete('/rooms/:roomId', requireAuth, async (req, res, next) => {
  try {
    const room = await getRoomState(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found.' });

    if (!room.owner || String(room.owner) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Only the room owner can delete it.' });
    }

    await deleteRoom(req.params.roomId);
    // A deleted room must not survive in the realtime hot cache (otherwise a
    // later socket join would silently resurrect it), and any queued debounced
    // write must be dropped as well.
    cancelPendingSave(req.params.roomId);
    evictRoom(req.params.roomId);

    // Tell anyone still connected that their workspace is gone.
    req.app.get('io')?.to(req.params.roomId).emit(EVENTS.ROOM_DELETED, {
      roomId: req.params.roomId,
      message: 'This room was deleted by its owner.',
    });

    return res.json({ ok: true, roomId: req.params.roomId });
  } catch (err) {
    return next(err);
  }
});
