import { useEffect, useState } from "react";
import Login from "./pages/login";
import Dashboard from "./pages/Dashboard";


function App() {
  const [status, setStatus] = useState("Cargando...");

  useEffect(() => {
    fetch("http://127.0.0.1:8000/health")
      .then((response) => response.json())
      .then((data) => {
        setStatus(data.status);
      })
      .catch((error) => {
        console.error("Error conectando con backend:", error);
        setStatus("Error");
      });
  }, []);

  const [user, setUser] = useState(null);
  if (user) {
    return <Dashboard user={user} />;
  }
  return <Login setUser={setUser} />;


  return <Login/>;
}

export default App;