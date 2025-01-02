import { RedisOptions } from 'ioredis';
import fs from 'fs';

const file = './agentVersion.txt'; // Update the path if necessary

// Read and parse the config file synchronously
const agentVersion = fs.readFileSync(file, 'utf-8')?.toString() || "latest";


export default agentVersion; 