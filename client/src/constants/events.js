/**
 * Mirror of `server/src/constants/events.js`.
 * Keep both files identical so client and server always agree on wire names.
 */
export const EVENTS = {
  // client -> server
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  FILE_CREATE: 'file:create',
  FILE_OPEN: 'file:open',
  CODE_CHANGE: 'code:change',
  CURSOR_UPDATE: 'cursor:update',

  // server -> client
  ROOM_STATE: 'room:state',
  ROOM_FULL: 'room:full',
  FILE_CREATED: 'file:created',
  FILE_OPENED: 'file:opened',
  CODE_UPDATE: 'code:update',
  USERS_UPDATE: 'users:update',

  // shared
  ERROR_MESSAGE: 'error:message',
};

export const PANELS = {
  LEFT: 'left',
  RIGHT: 'right',
};
