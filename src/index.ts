import * as fs from 'fs';
import * as superagent from 'superagent';

export = Loadmill;

namespace Loadmill {
    export interface LoadmillOptions {
        token: string;
    }

    export interface TestResult {
        id: string;
        url: string;
        passed: boolean;
    }

    export type Configuration = object | string;
    export type ParamsOrCallback = object | Callback;
    export type Callback = {(err: Error | null, result: any): void} | undefined;
}

function Loadmill({token}: Loadmill.LoadmillOptions) {
    return {
        run(
            config: Loadmill.Configuration,
            paramsOrCallback?: Loadmill.ParamsOrCallback,
            callback?: Loadmill.Callback): Promise<string> {

            return wrap(
                async () => {
                    config = toConfig(config, paramsOrCallback);

                    const {body: {testId}} = await superagent.post("https://www.loadmill.com/api/tests")
                        .send(config)
                        .auth(token, '');

                    await superagent.put(`https://www.loadmill.com/api/tests/${testId}/load`)
                        .auth(token, '');

                    return testId;
                },
                callback || paramsOrCallback
            );
        },

        wait(loadTestId: string, callback?: Loadmill.Callback): Promise<Loadmill.TestResult> {
            let _resolve, _reject;

            const intervalId = setInterval(async () => {
                    try {
                        const {body: {result}} = await superagent.get(`https://www.loadmill.com/api/tests/${loadTestId}`)
                            .auth(token, '');

                        if (result) {
                            clearInterval(intervalId);

                            const testResult = {
                                id: loadTestId,
                                passed: result === 'done',
                                url: `https://www.loadmill.com/app/test/${loadTestId}`,
                            };

                            if (callback) {
                                callback(null, testResult);
                            }
                            else {
                                _resolve(testResult);
                            }
                        }
                    }
                    catch (err) {
                        if (callback) {
                            callback(err, null);
                        }
                        else {
                            _reject(err);
                        }
                    }
                },
                10 * 1000);

            return callback ? null! as Promise<any> : new Promise((resolve, reject) => {
                _resolve = resolve;
                _reject = reject;
            });
        },

        runFunctional(
            config: Loadmill.Configuration,
            paramsOrCallback?: Loadmill.ParamsOrCallback,
            callback?: Loadmill.Callback): Promise<Loadmill.TestResult> {

            return wrap(
                async () => {
                    config = toConfig(config, paramsOrCallback);

                    const {
                        body: {
                            id,
                            trialResult,
                            incompleteMessage,
                        }
                    } = await superagent.post("https://www.loadmill.com/api/tests/trials")
                        .send(config)
                        .auth(token, '');

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
        },
    };
}

function wrap(asyncFunction, paramsOrCallback?: Loadmill.ParamsOrCallback) {
    const promise = asyncFunction();

    if (typeof paramsOrCallback === 'function') {
        promise.then(res => paramsOrCallback(null, res))
            .catch(err => paramsOrCallback(err, null));
    }
    else {
        return promise;
    }
}

function toConfig(config: any | string, paramsOrCallback?: Loadmill.ParamsOrCallback) {
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
