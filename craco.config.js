const path = require('path');

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Find the HtmlWebpackPlugin and update it to use app.html
      const HtmlWebpackPlugin = webpackConfig.plugins.find(
        plugin => plugin.constructor && plugin.constructor.name === 'HtmlWebpackPlugin'
      );
      
      if (HtmlWebpackPlugin) {
        HtmlWebpackPlugin.options.template = path.resolve(__dirname, 'public/app.html');
        HtmlWebpackPlugin.options.filename = 'app.html';
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
      
      return webpackConfig;
    },
  },
};

