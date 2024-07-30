// Code for command prompt:
// const prompt = require('prompt-sync')();

// function Request(name, priority) {
//     this.name = name;
//     this.priority = priority;
//     this.difference = function(secondRequest) { return secondRequest.priority - this.priority; };
// }

// function prioritySort(unsortedRequests) {
//     return unsortedRequests.sort(function(request1, request2) { return request1.difference(request2)});
// }

// const numRequests = prompt("Please enter the number of requests you would like to make: ");
// let requests = []

// for (let i = 0; i < numRequests; i++) {
//     const name = prompt("Please enter the name of the request: ");
//     const priority = prompt("Please enter the priority of the request: ");
//     const request = new Request(name, priority);
//     requests.push(request);
// }

// console.log(requests);

// sortedRequests = prioritySort(requests);
// console.log(sortedRequests);

// Code for ACP:
function Request(name, priority) {
    this.name = name;
    this.priority = priority;
    this.difference = function(secondRequest) { return secondRequest.priority - this.priority; };
}

function prioritySort(unsortedRequests) {
    var sortedRequests = [];
    sortedRequests = unsortedRequests.sort(function(request1, request2) { return request1.difference(request2)});
    return sortedRequests;
}

function main() {
    Console.ReadLine("Please enter the number of requests you would like to make: ", 1);
    var numRequests = Console.LastReadResult;
    Console.PrintLine("Number of requests: "+ numRequests);
    var requests = []
    Console.PrintLine("------------------");

    for (var i = 0; i < numRequests; i++) {
        Console.PrintLine("Input number " + (i+1));
        Console.ReadLine("Please enter the name of the request: ", 1);
        var name = Console.LastReadResult;
        Console.PrintLine("Provided name: "+ name);
        Console.ReadLine("Please enter the priority of the request: ", 1);
        var priority = parseInt(Console.LastReadResult);
        Console.PrintLine("Provided priority: " + priority);
        Console.PrintLine("Priority primitive type: " + typeof(priority));
        var request = new Request(name, priority);
        requests.push(request);
        Console.PrintLine("------------------");
    }

    Console.PrintLine("Requests:");
    for (var j = 0; j < requests.length; j++) {
        Console.PrintLine("Name: " + requests[j].name + ", Priority: " + requests[j].priority);
    }

    Console.PrintLine("------------------");

    sortedRequests = prioritySort(requests);

    Console.PrintLine("Sorted Requests:");
    for (var k = 0; k < sortedRequests.length; k++) {
        Console.PrintLine("Name: " + sortedRequests[k].name + ", Priority: " + sortedRequests[k].priority);
    }
    // Console.PrintLine(sortedRequests);

    // Console.PrintLine(Util.SysJulianDate);
    // 2460515.23430038
}