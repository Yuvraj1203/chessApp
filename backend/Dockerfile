FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 4000
# Apply migrations, then start the API.
CMD ["sh", "-c", "npx drizzle-kit migrate && node dist/main"]
