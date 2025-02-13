const secretKey = process.argv[2]
const encodedKey = Buffer.from(secretKey).toString('base64')

console.log(encodedKey)