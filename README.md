# CodeSync

A real-time collaborative code editor built on the MERN stack with a
**Restrictive Editing** model: two users share one room, but each owns exactly
one panel. You can only type in *your* panel; your partner's panel is read-only
and mirrors their edits live (with their **live cursor** and **presence**). A
shared **file explorer** lets each editor create files or switch which file is
open in their own panel while edits stay in sync.

## Tech Stack

| Layer     | Technology                                             |
| --------- | ------------------------------------------------------ |
| Frontend  | React (Vite), Tailwind CSS, `@monaco-editor/react`     |
| Realtime  | Socket.io (client + server)                            |
| Backend   | Node.js, Express.js                                    |
| Transport | WebSocket with long-polling fallback                   |

## Folder Structure

```
CodeSync/
├── package.json              # npm workspaces + root scripts (run both apps)
├── .gitignore
├── README.md
│
├── server/                   # Express + Socket.io backend
│   ├── package.json
│   ├── .env.example
│   ├── src/
│       ├── server.js         # entry: HTTP server + Socket.io bootstrap
│       ├── app.js            # Express app (middleware, routes, errors)
│       ├── config/
│       │   ├── env.js        # env loading + validation
│       │   └── cors.js       # shared CORS policy (REST + WebSocket)
│       ├── constants/
│       │   └── events.js     # event names, panels, room limits, seed files
│       ├── db/
│       │   └── connect.js    # Mongoose connection helper
│       ├── middleware/
│       │   └── auth.js       # JWT bearer-auth guard
│       ├── models/
│       │   ├── User.js       # auth + password hashing (bcrypt)
│       │   └── Room.js       # files, open-panel mapping, owner, participants
│       ├── services/
│       │   ├── authService.js    # sign/verify JWTs
│       │   └── roomService.js    # room persistence (debounced file saves)
│       ├── utils/
│       │   └── filePaths.js      # virtual path validation + language mapping
│       ├── routes/
│       │   ├── health.js     # GET /api/health
│       │   ├── auth.js       # register / login / me
│       │   ├── rooms.js      # create / list / get rooms
│       │   └── execute.js    # POST /api/execute (proxies to Piston)
│       └── sockets/
│           ├── roomStore.js      # in-memory room registry (hot cache)
│           └── socketHandler.js  # join / file-open / code-change + enforcement
│
│   └── tests/                # node:test + supertest + memory MongoDB
│       ├── helpers/
│       │   ├── db.js         # isolated in-memory Mongo per test file
│       │   └── socket.js     # test server + socket client utilities
│       ├── auth.test.js      # register / login / me / validation
│       ├── rooms.test.js     # create / list / private read / owner delete
│       ├── execute.test.js   # validation, JS runner, secret isolation
│       └── files.test.js     # seating, restrictive editing, file CRUD
│
└── client/                   # React + Vite frontend
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    ├── .env.example
    └── src/
        ├── main.jsx
        ├── App.jsx           # router (login / dashboard / workspace)
        ├── index.css         # Tailwind entry + global + cursor styles
        ├── constants/
        │   ├── events.js     # mirror of server event names
        │   └── editor.js     # Monaco options, palette, runnable languages
        ├── lib/
        │   ├── socket.js     # shared Socket.io client singleton
        │   └── api.js        # REST helper (auth, rooms, execution)
        ├── context/
        │   └── AuthContext.jsx       # JWT session, login/register/logout
        ├── hooks/
        │   ├── useCollaboration.js   # all realtime state + actions
        │   └── useRunner.js          # code execution lifecycle
        ├── pages/
        │   ├── LoginPage.jsx
        │   ├── DashboardPage.jsx
        │   └── WorkspacePage.jsx
        └── components/
            ├── JoinRoomModal.jsx
            ├── RoomHeader.jsx
            ├── FileExplorer.jsx
            ├── EditorPanel.jsx
            └── OutputConsole.jsx
```

## Realtime Features

| Feature        | Event(s)                                | Notes |
| -------------- | --------------------------------------- | ----- |
| Room join/leave | `room:join` / `room:leave`             | Seats two editors, rejects a third |
| File explorer  | `file:open` / `file:opened`             | Each editor switches the file in their own panel |
| Create file    | `file:create` / `file:created`          | New virtual files appear for both editors |
| Rename file    | `file:rename` / `file:renamed`          | Stable file id: panels, cursors and live code survive |
| Delete file    | `file:delete` / `file:deleted`          | Panels re-point to another file; a room keeps ≥ 1 file |
| Code sync      | `code:change` / `code:update`           | Server-enforced panel + open-file ownership |
| Live cursors   | `cursor:update`                         | Partner caret + username tag (Monaco decoration) |
| Presence       | `users:update`                          | Coloured roster per panel |
| Accounts       | JWT (Bearer)                           | Register/login; guests still joinable |
| Persistence    | MongoDB (Mongoose)                     | Rooms + files survive restarts |
| Dashboard      | `GET/POST/DELETE /api/rooms`           | Create/list/delete rooms, deep-link by id |

## Persistence & Auth

- **Auth**: bcrypt-hashed passwords + JWT (`POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`). JWT is attached to REST calls *and* the Socket.io handshake, so authenticated users are always identified by account.
- **Guests**: no token? Still joinable by room id — the workspace just asks for a display name.
- **Privacy**: `GET /api/rooms/:roomId` is member-only (owner + participants) and `DELETE /api/rooms/:roomId` is owner-only. Room ids are unguessable random hex, but still act as an invite token for the socket join — anyone holding the id can join.
- **Persistence**: room files and each panel's open-file selection are written to MongoDB (file saves are debounced to one write per typing burst). Logged-in users get a "Your rooms" dashboard and room ownership.
- **Idle cleanup**: rooms untouched for `ROOM_TTL_DAYS` (default 30, `0` disables) are pruned by a sweep that runs at boot and every 6 hours.
- Set `MONGO_URI` (local or MongoDB Atlas) and a strong `JWT_SECRET` in `server/.env`.

## Code Execution

The **Run** button executes the file open in *your own* panel (never your
partner's) in its language and shows the result in the output console (stdout,
stderr, exit code, plus a stdin box).

The browser only calls CodeSync's own `POST /api/execute`. The Express backend
then calls a **Piston-compatible runner** and returns the result. The runner URL
and optional API key stay on the server and are never sent to the browser.

### Why the 401 happened

Until 2026-02-15, `https://emkc.org/api/v2/piston` was free to use. It is now
whitelist-only, so unauthenticated requests receive
`401 - Public Piston API is now whitelist only as of 2/15/2026.` CodeSync no
longer defaults to that endpoint; `PISTON_API_URL` must point at your own (or
otherwise authorised) runner.

### Self-hosted Piston runner

Prerequisites: Docker with Compose, and cgroup v2 enabled on Linux hosts.

From the repository root:

```powershell
docker compose -f docker-compose.piston.yml up -d
```

Or with plain Docker:

```bash
docker volume create piston_data
docker run -d --name piston --privileged -p 2000:2000 -v piston_data:/piston ghcr.io/engineer-man/piston
```

A fresh Piston container has **no language runtimes installed**. Install the
ones CodeSync supports (PowerShell commands shown):

```powershell
$r = 'http://localhost:2000/api/v2'
Invoke-RestMethod -Method Post -Uri "$r/packages" -ContentType 'application/json' -Body '{"language":"python","version":"3.12.0"}'
Invoke-RestMethod -Method Post -Uri "$r/packages" -ContentType 'application/json' -Body '{"language":"java","version":"15.0.2"}'
Invoke-RestMethod -Method Post -Uri "$r/packages" -ContentType 'application/json' -Body '{"language":"gcc","version":"10.2.0"}'
Invoke-RestMethod -Method Post -Uri "$r/packages" -ContentType 'application/json' -Body '{"language":"javascript","version":"20.11.1"}'
Invoke-RestMethod -Method Post -Uri "$r/packages" -ContentType 'application/json' -Body '{"language":"typescript","version":"5.0.3"}'
```

Verify with `Invoke-RestMethod http://localhost:2000/api/v2/runtimes` (or open
that URL in a browser). The `gcc` package provides both `c` and `c++`.

Then set `server/.env` and restart the backend:

```dotenv
PISTON_API_URL=http://localhost:2000/api/v2
PISTON_TIMEOUT_MS=15000
# Only if your private runner requires a token:
# PISTON_API_KEY=your-key
```

A full endpoint URL such as `.../api/v2/execute` is accepted too. On Render,
set `PISTON_API_URL` to a publicly reachable runner URL (the blueprint prompts
for it); `localhost` there would mean the Render container itself.

If the runner is down, unconfigured or rejects the request, the output console
shows a clear message (for example "Code execution service is unavailable" or
"Code runner authentication failed") instead of crashing. Details are logged
server-side only.

### Testing Java, Python and C++

Open a room, select the language in the editor and click **▶ Run**. Tick
**stdin** first for programs that read input.

| Language | Code | stdin | Expected output |
| -------- | ---- | ----- | --------------- |
| Python | `name = input("Name: ")\nprint("Hello,", name)` | `Ada` | `Name: Hello, Ada` |
| Java | `import java.util.Scanner; public class Main { public static void main(String[] a) { System.out.println("Sum=" + (2 + 3)); System.out.println("In=" + new Scanner(System.in).nextLine()); } }` | `hi` | `Sum=5` then `In=hi` |
| C++ | `#include <iostream>\nint main(){int a,b; std::cin>>a>>b; std::cout<<"Sum="<<a+b<<"\n";}` | `2 3` | `Sum=5` |

Java files are sent to Piston with a filename matching the `public class`, so
compilation errors show up in the output console.

### Local runner (development only)

If the configured runner is unreachable, the backend can run code as a child
process of itself. This is convenient for demos but **unsandboxed**, so it is
disabled automatically when `NODE_ENV=production` (override with
`ALLOW_LOCAL_EXEC`):

| Language   | Needs on PATH                       |
| ---------- | ----------------------------------- |
| JavaScript | the Node.js you already installed   |
| TypeScript | `npx` (fetches `tsx` on first run)  |
| Python     | `python`                            |
| Java       | `javac` + `java` (JDK 17+)          |
| C++        | `g++` (e.g. `winget install BrechtSanders.WinLibs.POSIX.UCRT`) |

Child processes receive a **whitelisted environment** (no `JWT_SECRET` /
`MONGO_URI`) and output is capped at 64 KB.

## How Restrictive Editing Works

1. A user joins a room. The server seats them in the first free panel:
   **left** for the first joiner, **right** for the second.
2. Monaco on each side is `readOnly` unless the panel matches the user's role.
3. The file explorer lists the room's shared files. Clicking one emits
   `file:open`; the server updates only the sender's panel mapping and tells the
   other peer with `file:opened`. **+ New** emits `file:create`; the server
   validates the virtual path, adds the file, opens it in the creator's panel
   and broadcasts `file:created` to the partner. Hovering a file reveals
   **✎ rename** and **🗑 delete**: renaming keeps the stable file id, while
   deleting re-points any panel that had it open (a room always keeps one file).
4. On every keystroke the client emits `code:change`; the server **verifies the
   sender owns that panel and that the file is the one open there** before
   persisting and broadcasting `code:update`. A tampered client cannot edit the
   other panel or a file it does not have open.
5. A third join is rejected with `room:full`.

## Getting Started

Prerequisites: **Node.js 18+**.

> **MongoDB is recommended.** Either run it locally
> (`mongodb://127.0.0.1:27017/codesync`) or point `MONGO_URI` at a
> [MongoDB Atlas](https://www.mongodb.com/atlas) free cluster.
>
> In development, if MongoDB cannot be reached, the server automatically starts
> an in-memory MongoDB so the realtime backend still boots. Data in that
> fallback is ephemeral (lost on restart), so use a real MongoDB for demo data
> you want to keep.

```bash
# 1. Install dependencies for both workspaces (from the repo root)
npm install

# 2. Configure environment variables
cp server/.env.example server/.env
cp client/.env.example client/.env
#    ...then edit server/.env: MONGO_URI + JWT_SECRET (+ Piston if executing code)

# 3. Run backend + frontend together
npm run dev
```

- Frontend: http://localhost:5173
- Backend:  http://localhost:5000  (health: `/api/health`)

Open the app in **two browser tabs/windows**, enter the **same Room ID** with
different names, and start editing. Each tab controls a different panel; use the
**Explorer** sidebar to pick which file that panel shows, or **+ New** to create
a file such as `src/components/Button.jsx`.

### Useful scripts (run from repo root)

| Command            | Description                                  |
| ------------------ | -------------------------------------------- |
| `npm run dev`      | Run server and client concurrently            |
| `npm run dev:server` | Backend only (`node --watch`)               |
| `npm run dev:client` | Frontend only (Vite)                        |
| `npm run build`    | Production build of the client                |
| `npm test`         | Backend test suite (28 tests, in-memory DB)   |
| `npm start`        | Start the backend in (production) mode         |

## Deploy to Render

The repo includes a [Blueprint](./render.yaml) that deploys the API, Socket.io
gateway and built React SPA as **one Web Service**:

1. Push to GitHub, then in Render: **New → Blueprint** → select this repo.
2. Fill in the prompted `MONGO_URI` (MongoDB Atlas); `JWT_SECRET` is generated
   automatically. Name the service `codesync` (or update `render.yaml`).
3. Deploy. Build: `npm ci --include=dev && npm run build`; start: `npm start`;
   health check: `/api/health`.

The client uses `VITE_SERVER_URL` when set (local dev) and otherwise falls back
to `window.location.origin`, so the same build works on any Render URL or custom
domain without a rebuild. Render's own `RENDER_EXTERNAL_URL` is auto-allowed by
CORS. For a custom domain, also set `CLIENT_ORIGIN` to that exact origin.

## Notes for Production

- **Done:** in production, Express serves the built `client/dist` SPA (with an
  SPA route fallback) whenever `client/dist/index.html` exists. Set
  `CLIENT_DIST_PATH` if the build output lives elsewhere. The API keeps its own
  JSON 404s under `/api/*`.
- **Done:** per-IP fixed-window rate limits protect the public
  `/api/auth/*` and `/api/execute` endpoints. Tune with `RATE_LIMIT_WINDOW_MS`,
  `AUTH_RATE_LIMIT_MAX` and `EXECUTE_RATE_LIMIT_MAX`; use Redis/an API gateway
  when running more than one server instance.
- Keep local code execution OFF (`NODE_ENV=production` disables it by default)
  and point `PISTON_API_URL` at an isolated runner.
- Tighten `CLIENT_ORIGIN` to your real domains. CORS allows `DELETE` so room
  deletion works from the browser.
- **Remaining for horizontal scale:** replace the in-memory `roomStore` with
  **Redis** + the Socket.io Redis adapter so rooms survive restarts and are
  shared across processes. The current `Map` is intentional for a single-node
  deployment / college demo.
