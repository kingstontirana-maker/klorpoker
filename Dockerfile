# Plain Node image for Coolify ("Build Pack: Dockerfile"). The game has no npm
# dependencies, so there is nothing to install. Accounts and balances live on the
# persistent volume (STATE_FILE=/data/state.json), never inside the image.
FROM node:22-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
