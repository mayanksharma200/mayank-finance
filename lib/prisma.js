import { PrismaClient } from "@prisma/client";

const globalForPrisma = global;

const db = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export { db }; // Named export instead of default
