import * as fs from 'fs';
import * as superagent from 'superagent';

export = function ({token}: { token: string }) {
    return new LoadmillClient(token);
}

class LoadmillClient {
    constructor(readonly token: string) {
    }

    run = (config: object | string, paramsOrCallback?: ParamsOrCallback, callback?: Callback) => wrap(
        async () => {
            config = toConfig(config, paramsOrCallback);

            const {body: {testId}} = await this._auth(superagent.post("https://www.loadmill.com/api/tests")
                .send(config));

            await this._auth(superagent.put(`https://www.loadmill.com/api/tests/${testId}/load`));

            return testId;
        },
        callback || paramsOrCallback
    );

    runFunctional = async (config: object | string, paramsOrCallback?: ParamsOrCallback, callback?: Callback) => wrap(
        async () => {
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
        },
        callback || paramsOrCallback
    );

    _auth = req => req.auth(this.token, '');
}

function wrap(asyncFunction, paramsOrCallback?: ParamsOrCallback) {
    const promise = asyncFunction();

    if (typeof paramsOrCallback === 'function') {
        promise.then(res => paramsOrCallback(null, res))
            .catch(err => paramsOrCallback(err, null));
    }
    else {
        return promise;
    }
}

function toConfig(config: any | string, paramsOrCallback?: ParamsOrCallback) {
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

type ParamsOrCallback = object | Callback;
type Callback = {(err, result): void};
