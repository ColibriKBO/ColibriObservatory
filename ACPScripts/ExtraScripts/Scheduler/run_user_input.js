const { spawn } = require('child_process');


const fs = require('fs');
const { parse } = require('csv-parse');

// Run a python script and return output
function runPythonScript(scriptPath, args) {
    const env = Object.create(process.env);
    env.Display = ':0';

    // Use child_process.spawn method from child_process module and assign it to variable
    const pyProg = spawn('python', [scriptPath].concat(args), { env: env });

    // Collect data from script and print to console
    let data = '';
    pyProg.stdout.on('data', (stdout) => {
        data += stdout.toString();
    });

    // Print errors to console, if any
    pyProg.stderr.on('data', (stderr) => {
        console.log(`stderr: ${stderr}`);
    });

    // When script is finished, print collected data
    pyProg.on('close', (code) => {
        console.log(`child process exited with code ${code}`);
        console.log(data);
    });
}

    // Run the Python file
    runPythonScript('user_input_to_csv.py');

    fs.createReadStream("colibri_user_observations.csv")
        .pipe(parse({ delimiter: ',' }))
        .on('data', (row) => {
            console.log(row);
        })
        .on("error", (err) => {
            console.error(err);
        })
        .on("end", () => {
            console.log("finished");
        })