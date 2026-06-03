/*
  Warnings:

  - You are about to drop the column `expiresAt` on the `BotInstance` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `BotInstance` table. All the data in the column will be lost.
  - You are about to drop the column `ownerId` on the `BotInstance` table. All the data in the column will be lost.
  - You are about to drop the column `token` on the `BotInstance` table. All the data in the column will be lost.
  - Added the required column `botId` to the `BotInstance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `botName` to the `BotInstance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `botToken` to the `BotInstance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `buyerId` to the `BotInstance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `guildId` to the `BotInstance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subscriptionExpiresAt` to the `BotInstance` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BotInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "botName" TEXT NOT NULL,
    "botToken" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '!',
    "status" TEXT NOT NULL DEFAULT 'STOPPED',
    "subscriptionExpiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BotInstance" ("createdAt", "id", "status", "templateId", "updatedAt") SELECT "createdAt", "id", "status", "templateId", "updatedAt" FROM "BotInstance";
DROP TABLE "BotInstance";
ALTER TABLE "new_BotInstance" RENAME TO "BotInstance";
CREATE UNIQUE INDEX "BotInstance_botName_key" ON "BotInstance"("botName");
CREATE UNIQUE INDEX "BotInstance_botId_key" ON "BotInstance"("botId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
