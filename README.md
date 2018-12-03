# Loadmill

Users of [Loadmill](https://www.loadmill.com) can use this node module to: 
1. Run load tests on loadmill.com.
2. Run functional tests on loadmill.com.
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

The following code runs a very simple load test that gets a single page from `www.myapp.com` every second for one minute:
```js
const loadmill = require('loadmill')({token: process.env.LOADMILL_API_TOKEN});

// You may also give a path to a valid JSON file instead:
loadmill.run({requests: [{url: "www.myapp.com"}]}, (err, id) => {
    if (!err) {
        console.log("Load test started: " + id);
    }
});
```

### Test Configuration

The JSON test configuration may be exported from the loadmill test editor or from an old test run.
Read more about the configuration format [here](https://docs.loadmill.com/test-scenarios/configuration-files).

### Using Promises

Every function that accepts a callback will return a promise instead if no callback is provided (and vice versa):
```js
loadmill.run("./load-tests/simple.json")
    .then(id => console.log("Load test started: ", id))
    .catch(err => console.error("Something bad: ", err));
```

### Waiting for Tests

Since load tests usually run for at least a few minutes, the loadmill client does not wait for them to finish by default.
You can explicitly wait for a test to finish using the `wait` function:
 ```js
loadmill.run("./load-tests/long_test.json")
    .then(loadmill.wait)
    // -> {id: string, type: 'load', passed: boolean, url: string}
    .then(result => console.log(result));
```

### Running multiple tests

In case you wish to run all the Loadmill tests in a given folder you can use the `runFolder` API.
It will execute all the tests *synchronously* (using the `wait` option by default) unless a test has failed.
This API returns an array of the tests result:
 ```js
loadmill.runFolder("/path/to/tests/folder")
    // -> [{id: string, type: 'load', passed: boolean, url: string}]
        .then(results => console.log(results));
```

### Functional Tests

You may also use a test configuration to run a functional test (i.e. a single iteration of requests) - this is usually useful for testing your API for regressions after every new deployment.
Functional tests are expected to be shorter and thus are awaited on by default:
```js
loadmill.runFunctional("./load-tests/api_test.json")
    // -> {id: string, type: 'functional', passed: boolean, url: string}
    .then(result => console.log(result));
```

If your functional test is supposed to, or may, take longer than 25 seconds, you can use `runAsyncFunctional` instead:
```js
loadmill.runAsyncFunctional("./load-tests/api_test.json")
    // -> {id: string, type: 'functional', passed: null, url: string}
    .then(result => console.log(result));
```

Note that in this case the `passed` property is `null` since the promise resolves before the test is finished.
If you want to wait for the full result you can use `wait` here as well:
```js
loadmill.runAsyncFunctional("./load-tests/api_test.json")
    .then(loadmill.wait)
    // -> {id: string, type: 'functional', passed: boolean, url: string}
    .then(result => console.log(result));
```

### Parameters

You will usually want some part of your test to be _dynamic_, e.g. the host name of the tested server.
With Loadmill, this is made easy by using [parameters](https://docs.loadmill.com/test-scenarios/parameters).
You may set/override parameter defaults for a test by passing a hash mapping parameter names to values:
```js
// Parameters may come before or instead of a callback:
loadmill.run("./load-tests/parametrized_test.json", {host: "test.myapp.com", port: 4443}, (err, id) => {/*...*/});

// You may also use predefined parameter values as well:
loadmill.runFunctional("./load-tests/parametrized_test.json", {host: "test.${parentDomain}"});
```

## CLI

The loadmill Command Line Interface basically wraps the functions provided by the node module:
```
loadmill <config-file-or-folder> -t <token> [options] [parameter=value...]
```

### Functional Tests

The default is to run a functional test:
```
loadmill test.json --token DW2rTlkNmE6A3ax5LVTSDxv2Jfw4virjQpmbOaLG
```

Unless the `-q` option is set, the result JSON will be printed to the standard output.

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

### CLI Options

Full list of command line options:

- `-h, --help` Output usage information.
- `-t, --token <token>` Provide a Loadmill API Token. You must provide a token in order to run tests.
- `-l, --load-test` Launch a load test. If not set, a functional test will run instead.
- `-a, --async` Run the test asynchronously - affects only functional tests. Use this if your test can take longer than 25 seconds (otherwise it will timeout).
- `-w, --wait` Wait for the test to finish. Functional tests are automatically waited on unless async flag is turned on.
- `-n, --no-bail` Return exit code 0 even if test fails.
- `-q, --quiet` Do not print out anything (except errors).
- `-v, --verbose` Print out extra information for debugging (trumps `-q`).
