 

export class ShellService {
    private static remoteShellClients: any = {};
    private static frontendClients: any = {};

    private constructor() { }

    public static getRemoteShellClients(): any {
        if (!ShellService.remoteShellClients) {
            ShellService.remoteShellClients = {};
        }
        return ShellService.remoteShellClients;
    }

    public static getFrontendClients(): any {
        if (!ShellService.frontendClients) {
            ShellService.frontendClients = {};
        }
        return ShellService.frontendClients;
    }

 
    public static getRemoteShellClient(shellID: string): any {
        return ShellService.remoteShellClients[shellID];
    }

    public static getFrontendClient(shellID: string): any {
        return ShellService.frontendClients[shellID];
    }

    public static setRemoteShellClient(shellID: string, socket: any): void {
        ShellService.remoteShellClients[shellID] = socket;
    }

    public static setFrontendClient(shellID: string, socket: any): void {
        ShellService.frontendClients[shellID] = socket;
    }

    public static removeRemoteShellClient(shellID: string): void {
        delete ShellService.remoteShellClients[shellID];
    }

    public static removeFrontendClient(shellID: string): void {
        delete ShellService.frontendClients[shellID];
    }

}