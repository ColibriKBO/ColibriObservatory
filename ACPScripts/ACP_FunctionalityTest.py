// A function that returns a promise
function examplePromise() {
    return new Promise((resolve, reject) => {
        let success = true; // Simulate a condition
        
        if (success) {
            resolve("Operation was successful!");  // The promise is resolved with a success message
        } else {
            reject("Something went wrong!");       // The promise is rejected with an error message
        }
    });
}

// Using the promise
examplePromise()
    .then((result) => {
        Console.PrintLine(result);  // This will run if the promise is resolved successfully
    })
    .catch((error) => {
        Console.PrintLine(error);  // This will run if the promise is rejected (error occurs)
    });
