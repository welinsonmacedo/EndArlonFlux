// Ficheiro: prisma.config.ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // 👇 MUDANÇA AQUI: Usamos a DIRECT_URL para os comandos do terminal!
    url: process.env.DIRECT_URL,
  },
});