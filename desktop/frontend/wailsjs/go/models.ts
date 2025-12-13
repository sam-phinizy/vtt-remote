export namespace main {
	
	export class ClientStats {
	    roomCount: number;
	    foundryCount: number;
	    phoneCount: number;
	    totalClients: number;
	
	    static createFrom(source: any = {}) {
	        return new ClientStats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.roomCount = source["roomCount"];
	        this.foundryCount = source["foundryCount"];
	        this.phoneCount = source["phoneCount"];
	        this.totalClients = source["totalClients"];
	    }
	}
	export class FoundryModuleStatus {
	    installed: boolean;
	    version?: string;
	    dataPath: string;
	    pathExists: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FoundryModuleStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.installed = source["installed"];
	        this.version = source["version"];
	        this.dataPath = source["dataPath"];
	        this.pathExists = source["pathExists"];
	    }
	}
	export class LogEntry {
	    timestamp: string;
	    level: string;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new LogEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.timestamp = source["timestamp"];
	        this.level = source["level"];
	        this.message = source["message"];
	    }
	}
	export class ServerStatus {
	    state: string;
	    port: number;
	    localIP: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new ServerStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.state = source["state"];
	        this.port = source["port"];
	        this.localIP = source["localIP"];
	        this.error = source["error"];
	    }
	}

}

