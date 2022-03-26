const app = require('./server-app');


const PORT = process.env.PORT ? process.env.PORT : 5011;
app.listen(PORT, () => {
  console.log(`server running on port ${PORT}`);
});