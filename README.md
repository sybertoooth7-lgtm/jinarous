WHERE EACH FILE GOES IN github.com/sybertoooth7-lgtm/jinarous
================================================================

Open each path below in the GitHub web editor, select all existing
content, delete it, and paste in the matching file from this folder.

  outputs/backend/src/lib/email.js        -> backend/src/lib/email.js
  outputs/backend/src/stats.js            -> backend/src/stats.js
  outputs/backend/src/routes/status.js    -> backend/src/routes/status.js
  outputs/backend/env.railway.txt         -> backend/.env.railway
                                              (renamed to .txt here only
                                              because dotfiles are easy to
                                              lose track of when downloading;
                                              rename it back to .env.railway
                                              once it's in the repo)

  outputs/frontend/index.html             -> frontend/index.html
  outputs/frontend/src/sections/Hero.tsx     -> frontend/src/sections/Hero.tsx
  outputs/frontend/src/sections/Services.tsx -> frontend/src/sections/Services.tsx
  outputs/frontend/src/sections/Footer.tsx   -> frontend/src/sections/Footer.tsx
  outputs/frontend/src/sections/Contact.tsx  -> frontend/src/sections/Contact.tsx

ONE FILE TO DELETE (not replace)
--------------------------------
  frontend/src/section/contact.tsx

This is a leftover duplicate of frontend/src/sections/Contact.tsx (note:
singular "section" folder, no capital C) from an old rename. It isn't used
anywhere, but it was breaking `npm run build` on its own. In the GitHub
web editor: open that file, use the "..." menu -> Delete file.

After all of the above, everything was verified with a real
`npm run build` in a clean install (npm install + tsc -b + vite build) —
no errors, no leftover references to the old fictional AI copy.
