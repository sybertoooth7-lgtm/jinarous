# Required npm packages to install

# Core (should already be installed)
# express, cors, cookie-parser, helmet, bcrypt, jsonwebtoken, express-validator, pg

# NEW — for cluster-safe rate limiting (Fix #5)
npm install rate-limit-redis ioredis

# Optional but recommended
npm install dotenv  # if not already using dotenv
