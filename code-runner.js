/**
 * NexusAI Code Runner (Web Worker)
 * Safely executes JavaScript code in a sandboxed environment.
 */
self.onmessage = function(event) {
    const logs = [];
    // Temporarily override console.log to capture output
    const originalLog = console.log;
    console.log = (...args) => {
        // Convert all arguments to a string format for display
        const formattedArgs = args.map(arg => {
            if (typeof arg === 'object' && arg !== null) {
                try {
                    return JSON.stringify(arg);
                } catch (e) {
                    return 'Unserializable Object';
                }
            }
            return String(arg);
        });
        logs.push(formattedArgs.join(' '));
        originalLog.apply(console, args); // Also log to the actual worker console for debugging
    };

    try {
        // Execute the user's code
        eval(event.data.code);
        const output = logs.join('\n');
        self.postMessage({ 
            result: output || 'Code executed successfully with no output.', 
            error: null 
        });
    } catch (e) {
        self.postMessage({ 
            result: logs.join('\n'), 
            error: e.message 
        });
    } finally {
        // Restore the original console.log function
        console.log = originalLog;
    }
};
