
import fs from 'fs';

interface ConfigData {
    API_TOKEN: string
    SECRET_KEY: string
    
}



const configFile = './config.json'; // Update the path if necessary

// Read and parse the config file synchronously
const agentConfig: ConfigData = JSON.parse(fs.readFileSync(configFile, 'utf-8'));



export default agentConfig;