# Loadmill

Users of [Loadmill](https://www.loadmill.com) can use this node module to: 
1. Run API tests on loadmill.com.
2. Run load tests on loadmill.com.
3. Do both programmatically or via [CLI](#cli).

## Installation

Using npm:

`npm install loadmill --save`

Using yarn:

`yarn add loadmill`

If you need to run the loadmill CLI outside of an npm script, you may prefer to install this package globally.

Using npm:

`npm install -g loadmill`

Using yarn:

`yarn global add loadmill`

## Usage

### API Tokens
In order to use the Loadmill REST API or our node module and CLI, you will need to generate an [API Token](https://docs.loadmill.com/integrations/api-tokens).

### Test Plans

You can launch an existing test plan by supplying the test plan id:

```js
const testPlan = await loadmill.runTestPlan(
    {
        id: "test-plan-uuid" // required
        options: { //optional
            additionalDescription: "description to add", // added at the end of of each test suite
            labels: ["label1", "label2"], // run suites that have flows assigned to specific label/s
            pool: "some-pool-name", // Execute tests from a dedicated agent's pool (when using private agent)
            parallel: 2 , // Set the concurrency amount of a running test suites in a test plan. Max concurrency is 10
            tags: ["tag1", "another tags"], // Set of strings attached to the plan run and later can be query by
        }
    },
    { "parameterKey": "overrided value" } //optional
);

const result = await loadmill.wait(testPlan);       
```

### Load tests

The following code runs a very simple load test that gets a single page from `www.myapp.com` every second for one minute:
```js
const loadmill = require('loadmill')({token: process.env.LOADMILL_API_TOKEN});

// You may also give a path to a valid Test Configuration JSON file instead:
const id = await loadmill.run({requests: [{url: "www.myapp.com"}]});
console.log("Load test started: " + id);
```

### Test Configuration

The JSON test configuration may be exported from the loadmill test editor or from an old test run.

Read more about the configuration format [here](https://docs.loadmill.com/load-testing/working-with-the-test-editor/configuration-files).


### Waiting for Tests

Since load tests usually run for at least a few minutes, the loadmill client does not wait for them to finish by default.
You can explicitly wait for a test to finish using the `wait` function:
 ```js
/**
 * @returns {id: string, type: 'load' | 'test-plan', passed: boolean, url: string}
 */
loadmill.run("./load-tests/long_test.json")
    .then(loadmill.wait)
    .then(result => console.log(result));

// promise with async/await
const loadTestId = await loadmill.run({ requests: [{ url: "www.myapp.com" }] });
const result = await loadmill.wait(loadTestId);
```

### Parameters

You will usually want some part of your test to be _dynamic_, e.g. the host name of the tested server.
With Loadmill, this is made easy by using [parameters](https://docs.loadmill.com/api-testing/test-suite-editor/parameters).
You may set/override parameter defaults for a test by passing a hash mapping parameter names to values:
```js
// Parameters may come before or instead of a callback:
loadmill.run("./load-tests/parametrized_test.json", {host: "test.myapp.com", port: 4443}, (err, id) => {/*...*/});
```

## CLI

The loadmill Command Line Interface basically wraps the functions provided by the node module:
```
loadmill <test-plan-id || load-test-config-file> -t <token> [options] [parameter=value...]
```

### Test Plan

You may launch a test plan by setting the --test-plan option:

```
loadmill  <test-plan-id> --test-plan -w -v -t <token> --report --colors --labels "label1,label2"
```

set the `-w` or `--wait` option in order to wait for the test-plan to finish, in which case only the result JSON will be
printed out at the end

You can add an additional description at the end of the current plan's description with the `--additional-description <description>` option.

You can tell loadmill to run flows that are assigned to a specific label with the `--labels <labels>` option. Multiple labels can be provided by seperated them with "," (e.g. 'label1,label2').

```
loadmill <test-plan-id> --test-plan -t <token> --labels "label1,label2" --additional-description "build 1986"
```

### Load Tests

You may launch a load test by setting the `-l` or `--load-test` option:
```
loadmill test.json --load-test -t DW2rTlkNmE6A3ax5LVTSDxv2Jfw4virjQpmbOaLG
```

The load test will be launched and its unique identifier will be printed to the standard output. You may alternatively
set the `-w` or `--wait` option in order to wait for the load test to finish, in which case only the result JSON will be
printed out at the end:
```
loadmill test.json -lw -t DW2rTlkNmE6A3ax5LVTSDxv2Jfw4virjQpmbOaLG
```

### Exit Status

Unless the `-n` or `--no-bail` option is set, the CLI process will exit with a nonzero exit code if the test had not passed.
Other errors, such as invalid command line arguments or unavailable network will always give a nonzero exit status.

### Parameters

You may set loadmill parameter values via command line arguments by passing `name=value` pairs:
```
loadmill parametrized_test.json host=test.myapp.com port=4443 -t DW2rTlkNmE6A3ax5LVTSDxv2Jfw4virjQpmbOaLG
```
Or supply a file using `--parameters-file`.

By default, overridden parameters are appended to the end of the parameters list. However, you can use the `inlineParameterOverride` flag to replace the parameters inline.

### CLI Options

Full list of command line options:

- `-h, --help` Output usage information.
- `-t, --token <token>` Provide a Loadmill API Token. You must provide a token in order to run tests.
- `-l, --load-test` Launch a load test. 
- `--test-plan` Launch a test plan (default). 
- `-p, --parallel` Set the concurrency of a running test suites in a test plan. Max concurrency is 10.
- `--additional-description <description>` Add an additional description at the end of the current test-plan's description.
- `--labels <labels>`, Run flows that are assigned to a specific label. Multiple labels can be provided by seperated them with "," (e.g. 'label1,label2'). 
- `--labels-expression <labelsExpression>`, Run a test plan's suites with flows that match the labels expression. An expression may contain the characters ( ) & | ! (e.g. '(label1 | label2) & !label3')
- `--pool <pool>` Execute tests from a dedicated agent's pool (when using private agent). 
- `--tags <tags>` Tag a test plan run with a comma separated list of tags (e.g. 'tag1,tag2'). 
- `-b --branch <branch>` Run the test plan's suites from a GitHub branch. The latest version of the selected Git branch will be used as the test configuration for the chosen Test Plan. 
- `--retry-failed-flows <numberOfRetries>` Configure the test plan to re-run failed flows in case your tested system is unstable. Tests that pass after a retry will be considered successful. 
- `--parameters-file <parametersFile>` Supply a file with parameters to override. File format should be 'name=value' divided by new line.
- `-w, --wait` Wait for the test to finish. 
- `-n, --no-bail` Return exit code 0 even if test fails.
- `-q, --quiet` Do not print out anything (except errors).
- `-v, --verbose` Print out extra information for debugging (trumps `-q`). In case of an error will print the entire test's requests otherwise will print only the failed request.
- `-r, --report` Print out Test Suite Flow Runs report when the suite has ended.
- `-j, --junit-report` Create Test Suite (junit style) report when the suite has ended.
- `--junit-report-path <path>` Save junit styled report to a path (defaults to current location) when `-j` flag is on.
- `-m, --mochawesome-report` Create Test Suite (mochawesome style) report when the suite has ended.
- `--mochawesome-report-path <mochawesomeReportPath>` Save JSON mochawesome styled report to a path (defaults to current location) when `-m` flag is on.
- `--colors` Print test results in color.
- `--inlineParameterOverride` Override parameters strategy - by default overrided parameters are appended to the end of the parameters list. Using this flag will replace the parameters inline.