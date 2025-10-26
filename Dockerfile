FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
ENV NODE_ENV=production
EXPOSE 5000

# đảm bảo package.json có "start": "node src/server.js"
CMD ["npm", "start"]
