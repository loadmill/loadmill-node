import * as fs from 'fs';
import * as superagent from 'superagent';

export = function ({token}: { token: string }) {
    return new LoadmillClient(token);
}

class LoadmillClient {
    constructor(readonly token: string) {
    }

    run = async (config: object | string, paramsOrCallback?) => {
        config = toConfig(config, paramsOrCallback);

        const {body: {testId}} = await this._auth(superagent.post("https://www.loadmill.com/api/tests")
            .send(config));

        await this._auth(superagent.put(`https://www.loadmill.com/api/tests/${testId}/load`));

        return testId;
    };

    runFunctional = async (config: object | string, paramsOrCallback?: object | {(err, id): void}) => {
        config = toConfig(config, paramsOrCallback);

        const {
            body: {
                id,
                trialResult,
                incompleteMessage,
            }
        } = await this._auth(superagent.post("https://www.loadmill.com/api/tests/trials")
            .send(config));

        if (incompleteMessage) {
            throw Error(incompleteMessage);
        }
        else {
            return {
                id,
                url: `https://www.loadmill.com/app/functional/${id}`,
                passed: trialResult && Object.keys(trialResult.failures || {}).length === 0,
            };
        }
    };

    _auth = req => req.auth(this.token, '');
}

function toConfig(config: any | string, paramsOrCallback?: object | {(err, id): void}) {
    if (typeof config === 'string') {
        let text = fs.readFileSync(config).toString();
        config = JSON.parse(text);
    }

    if (typeof paramsOrCallback === 'object' && paramsOrCallback != null) {
        let parameters = config.parameters;

        if (!parameters) {
            config.parameters = paramsOrCallback;
        }
        else if (typeof parameters.push === 'function') {
            parameters.push(paramsOrCallback);
        }
        else {
            config.parameters = [parameters, paramsOrCallback];
        }
    }

    return config;
}
