import './polyfills';
export = Loadmill;
declare function Loadmill(options: Loadmill.LoadmillOptions): {
    run(config: any, paramsOrCallback?: Loadmill.ParamsOrCallback, callback?: Loadmill.Callback): Promise<string>;
    runFolder(folderPath: string, paramsOrCallback?: Loadmill.ParamsOrCallback, callback?: Loadmill.Callback): Promise<Loadmill.TestResult[]>;
    wait(testDefOrId: string | Loadmill.TestDef, callback?: Loadmill.Callback): Promise<Loadmill.TestResult>;
    runFunctional(config: any, paramsOrCallback?: Loadmill.ParamsOrCallback, callback?: Loadmill.Callback): Promise<Loadmill.TestResult>;
    runFunctionalFolder(folderPath: string, paramsOrCallback?: Loadmill.ParamsOrCallback, callback?: Loadmill.Callback): Promise<Loadmill.TestResult[]>;
    runFunctionalLocally(config: any, paramsOrCallback?: Loadmill.ParamsOrCallback, callback?: Loadmill.Callback, testArgs?: Loadmill.Args | undefined): Promise<Loadmill.TestResult>;
    runFunctionalFolderLocally(folderPath: string, paramsOrCallback?: Loadmill.ParamsOrCallback, callback?: Loadmill.Callback): Promise<Loadmill.TestResult[]>;
    runAsyncFunctional(config: any, paramsOrCallback?: Loadmill.ParamsOrCallback, callback?: Loadmill.Callback): Promise<Loadmill.TestResult>;
    runTestSuite(suite: string | Loadmill.TestSuiteDef, paramsOrCallback?: Loadmill.ParamsOrCallback, callback?: Loadmill.Callback): Promise<Loadmill.TestDef>;
};
declare namespace Loadmill {
    interface LoadmillOptions {
        token: string;
    }
    interface TestDef {
        id: string;
        type: string;
    }
    interface TestSuiteDef {
        id: string;
        additionalDescription: string;
        labels?: string[] | null;
    }
    interface TestResult extends TestDef {
        url: string;
        passed: boolean;
        descrption: string;
    }
    type Configuration = object | string | any;
    type ParamsOrCallback = object | Callback;
    type Callback = {
        (err: Error | null, result: any): void;
    } | undefined;
    type Histogram = {
        [reason: string]: number;
    };
    type TestFailures = {
        [reason: string]: {
            [histogram: string]: Histogram;
        };
    };
    type Args = {
        verbose: boolean;
        colors?: boolean;
    };
    enum TYPES {
        LOAD = "load",
        FUNCTIONAL = "functional",
        SUITE = "test-suite",
        LOCAL = "local",
    }
}
