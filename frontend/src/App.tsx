import { Routes, Route } from 'react-router';
import HomePage from './pages/HomePage';
import ClientLogin from './pages/ClientLogin';
import ClientDashboard from './pages/ClientDashboard';

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/client/login" element={<ClientLogin />} />
      <Route path="/client/dashboard" element={<ClientDashboard />} />
    </Routes>
  );
}

export default App;
