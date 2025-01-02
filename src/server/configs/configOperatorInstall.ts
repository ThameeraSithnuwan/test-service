
import fs from 'fs';
import * as path from 'path';


const yamlFilePath = path.join(__dirname, 'config-operator-install.yaml');
// Read and parse the config file synchronously
const configOperatorInstallYaml: string = fs.readFileSync(yamlFilePath, 'utf-8');

export default configOperatorInstallYaml;