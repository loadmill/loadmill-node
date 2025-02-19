import * as superagent from 'superagent';
const HTTPSAgent = require('agentkeepalive').HttpsAgent;
const HTTPAgent = require('agentkeepalive');

type SuperAgentStatic = typeof superagent;
type AgentOptions = {
  timeout: number;
  freeSocketTimeout: number;
};

const DEFAULT_SOCKET_TIMEOUT = 60000;
/**
 * Factory for creating a singleton superagent instance with connection pooling
 */
class SuperagentFactory {
  instance: SuperAgentStatic | null;
  private agentOptions: AgentOptions;
  private httpAgent;
  private httpsAgent;
  
  constructor() {
    this.instance = null;
    
    this.agentOptions = {
      timeout: DEFAULT_SOCKET_TIMEOUT,           
      freeSocketTimeout: DEFAULT_SOCKET_TIMEOUT / 2,
    };
    
    this.httpAgent = new HTTPAgent(this.agentOptions);
    this.httpsAgent = new HTTPSAgent(this.agentOptions);
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
   * Update agent options and recreate agents
   * @param {Partial<AgentOptions>} options - New agent options
   */
  updateAgentOptions(options: Partial<AgentOptions>): void {
    this.agentOptions = { ...this.agentOptions, ...options };
    
    if (this.httpAgent) {
      this.httpAgent.destroy();
    }
    if (this.httpsAgent) {
      this.httpsAgent.destroy();
    }
    
    this.httpAgent = new HTTPAgent(this.agentOptions);
    this.httpsAgent = new HTTPSAgent(this.agentOptions);
    
    this.reset();
  }
}

const httpClientFactory = new SuperagentFactory();

export default httpClientFactory;