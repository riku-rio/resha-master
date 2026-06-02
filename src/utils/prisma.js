import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'
import { PrismaClient } from '@prisma/client'

const client = createClient({
  url: 'file:./dev.db',
})

const adapter = new PrismaLibSQL(client)
const prisma = new PrismaClient({ adapter })

export default prisma