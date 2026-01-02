const path = require('path');

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      const appName = process.env.APP_NAME || 'app';
      const outputDir = process.env.OUTPUT_DIR || 'build';
      
      // Set output path if custom directory specified
      if (outputDir !== 'build') {
        webpackConfig.output.path = path.resolve(__dirname, outputDir);
      }
      
      // Update entry point based on app name
      if (appName === 'gameoflife') {
        webpackConfig.entry = path.resolve(__dirname, 'src/index-gameOfLife.js');
      } else {
        webpackConfig.entry = path.resolve(__dirname, 'src/index.js');
      }
      
      // Find the HtmlWebpackPlugin and update it based on app name
      const HtmlWebpackPlugin = webpackConfig.plugins.find(
        plugin => plugin.constructor && plugin.constructor.name === 'HtmlWebpackPlugin'
      );
      
      if (HtmlWebpackPlugin) {
        if (appName === 'gameoflife') {
          HtmlWebpackPlugin.options.template = path.resolve(__dirname, 'public/game-of-life.html');
          HtmlWebpackPlugin.options.filename = process.env.NODE_ENV === 'production' ? 'game-of-life.html' : 'index.html';
        } else {
          HtmlWebpackPlugin.options.template = path.resolve(__dirname, 'public/app.html');
          HtmlWebpackPlugin.options.filename = process.env.NODE_ENV === 'production' ? 'app.html' : 'index.html';
        }
      }

      // Include mindone package from node_modules for JSX transpilation
      // (mindone publishes JSX source files, so webpack needs to transpile them)
      const oneOfRule = webpackConfig.module.rules.find(rule => rule.oneOf);
      
      if (oneOfRule) {
        const babelLoaderRule = oneOfRule.oneOf.find(
          rule => rule.test && (rule.test.toString().includes('jsx') || rule.test.toString().includes('js'))
        );
        
        if (babelLoaderRule) {
          const mindonePath = path.resolve(__dirname, 'node_modules/mindone/src');
          const fs = require('fs');
          
          // Only add if mindone is installed in node_modules
          if (fs.existsSync(mindonePath)) {
            if (babelLoaderRule.include) {
              if (Array.isArray(babelLoaderRule.include)) {
                if (!babelLoaderRule.include.includes(mindonePath)) {
                  babelLoaderRule.include.push(mindonePath);
                }
              } else {
                babelLoaderRule.include = [babelLoaderRule.include, mindonePath];
              }
            } else {
              babelLoaderRule.include = [
                path.resolve(__dirname, 'src'),
                mindonePath
              ];
            }
          }
        }
      }
      
      // Suppress source map warnings for third-party packages
      webpackConfig.ignoreWarnings = [
        /Failed to parse source map/,
        /ENOENT: no such file or directory/
      ];
      
      return webpackConfig;
    },
  },
};

