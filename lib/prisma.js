import { PrismaClient } from "@prisma/client";

let db;

if (!global.db) {
  global.db = new PrismaClient();
}

db = global.db;

export { db };
