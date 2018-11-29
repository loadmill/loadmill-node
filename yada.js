const fs = require("fs");
const path = require("path");


const getJSONFilesInFolderRecursively = (fileOrFolder, filelist = []) => {
    if (fs.statSync(fileOrFolder).isFile()) {
        filelist.push(fileOrFolder);
    } else {
        fs.readdirSync(fileOrFolder)
            .map(file => {
                let location = path.join(fileOrFolder, file);
                return fs.statSync(location).isDirectory() ?
                    getJSONFilesInFolderRecursively(location, filelist) :
                    filelist.push(location)
            });
    }
    return filelist.filter(file => file.endsWith('.json'));
};

(async function f() {
    const l = getJSONFilesInFolderRecursively('/tmp/rivi');
    console.log(l)
})();
