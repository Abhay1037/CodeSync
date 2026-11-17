import mongoose from 'mongoose';

/** A single file in the room's shared explorer. */
const fileSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    path: { type: String, required: true },
    folder: { type: String, default: '' },
    language: { type: String, default: 'javascript' },
    content: { type: String, default: '' },
  },
  { _id: false }
);

const roomSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, unique: true, index: true, trim: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    language: { type: String, default: 'javascript' },
    // Legacy two-panel document, kept so old rooms can be migrated on load.
    code: {
      left: { type: String, default: '' },
      right: { type: String, default: '' },
    },
    // Shared file tree + which file each panel currently has open.
    files: { type: [fileSchema], default: undefined },
    panelFiles: {
      left: { type: String, default: null },
      right: { type: String, default: null },
    },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    lastActiveAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const Room = mongoose.model('Room', roomSchema);
