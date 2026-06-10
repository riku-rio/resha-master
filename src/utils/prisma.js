require('dotenv').config({ quiet: true })
const path = require('path')
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3')
const { PrismaClient } = require('@prisma/client')

// Resolve to the project-root dev.db (where `prisma migrate deploy` writes it)
const dbPath = path.resolve(__dirname, '../../dev.db')
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` })
const prisma = new PrismaClient({ adapter })

module.exports = prisma