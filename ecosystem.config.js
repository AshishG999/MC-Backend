module.exports = {
    apps: [
        {
            name: "backend",
            script: 'server.js',
            instances: 1,
            autorestart: true,
            watch: false,
            env: {
                NODE_ENV: 'production',
                PORT: 9500
            }
        }
    ]
}