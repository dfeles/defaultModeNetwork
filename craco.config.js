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
      
      return webpackConfig;
    },
  },
};

