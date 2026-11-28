FROM node:22-alpine
WORKDIR /app
COPY server/apex-api/*.mjs ./
ENV PORT=8787 DATA_DIR=/data
VOLUME /data
USER node
EXPOSE 8787
CMD ["node", "server.mjs"]
