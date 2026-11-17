import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';
import {
  ensureRoom,
  getRoomState,
  listRoomsForUser,
} from '../services/roomService.js';

export const roomsRouter = Router();

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
    const requested = String(req.body?.roomId ?? '').trim().slice(0, 64);
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

/** GET /api/rooms/:roomId - public room state (used to preview / deep-link). */
roomsRouter.get('/rooms/:roomId', async (req, res, next) => {
  try {
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
