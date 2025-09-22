module.export = [
    apps: {
        name: "mc",
        script: 'server.js',
        instances: 1,
        autorestart: true,
        watch: false,
        // env: {
        //     NODE_ENV: ''
        // }
        

    }
]