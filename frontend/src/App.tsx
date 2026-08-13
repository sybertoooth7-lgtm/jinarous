import { Routes, Route } from 'react-router';
import HomePage from './pages/HomePage';
import ClientLogin from './pages/ClientLogin';
import ClientDashboard from './pages/ClientDashboard';
import VerifyScore from './pages/VerifyScore';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import SecurityPolicy from './pages/SecurityPolicy';
import CompliancePage from './pages/CompliancePage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/client/login" element={<ClientLogin />} />
      <Route path="/client/dashboard" element={<ClientDashboard />} />
      <Route path="/verify/:token" element={<VerifyScore />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/terms-of-service" element={<TermsOfService />} />
      <Route path="/security" element={<SecurityPolicy />} />
      <Route path="/compliance" element={<CompliancePage />} />
    </Routes>
  );
}

export default App;
