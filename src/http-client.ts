import * as superagent from 'superagent';
const HTTPSAgent = require('agentkeepalive').HttpsAgent;
const HTTPAgent = require('agentkeepalive');

type SuperAgentStatic = typeof superagent;
type KeepAliveOptions = {
  timeout: number;
  freeSocketTimeout: number;
};

const DEFAULT_SOCKET_TIMEOUT = 60000;
/**
 * Factory for creating a singleton superagent instance with connection pooling
 */
class SuperagentFactory {
  instance: SuperAgentStatic | null;
  private keepaliveOptions: KeepAliveOptions;
  private httpAgent;
  private httpsAgent;
  
  constructor() {
    this.instance = null;
    
    this.keepaliveOptions = {
      timeout: DEFAULT_SOCKET_TIMEOUT,           
      freeSocketTimeout: DEFAULT_SOCKET_TIMEOUT / 2,
    };
    
    this.httpAgent = new HTTPAgent(this.keepaliveOptions);
    this.httpsAgent = new HTTPSAgent(this.keepaliveOptions);
  }
  
  /**
   * Get the singleton superagent instance
   * @returns {SuperAgentStatic} Configured superagent instance
   */
  getInstance(): SuperAgentStatic {
    if (!this.instance) {
      this.instance = superagent;
      
      if (this.instance.agent) {
        this.instance.agent.http = this.httpAgent;
        this.instance.agent.https = this.httpsAgent;
      }
    }
    
    return this.instance;
  }
  
  reset(): void {
    this.instance = null;
  }
  
  /**
   * Update keepalive options and recreate agents
   * @param {Partial<KeepAliveOptions>} options - New keepalive options
   */
  updateKeepAliveOptions(options: Partial<KeepAliveOptions>): void {
    this.keepaliveOptions = { ...this.keepaliveOptions, ...options };
    
    if (this.httpAgent) {
      this.httpAgent.destroy();
    }
    if (this.httpsAgent) {
      this.httpsAgent.destroy();
    }
    
    this.httpAgent = new HTTPAgent(this.keepaliveOptions);
    this.httpsAgent = new HTTPSAgent(this.keepaliveOptions);
    
    this.reset();
  }
}

const httpClientFactory = new SuperagentFactory();

export default httpClientFactory;