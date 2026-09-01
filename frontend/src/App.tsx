import { Routes, Route } from 'react-router';
import HomePage from './pages/HomePage';
import ClientLogin from './pages/ClientLogin';
import ClientSignup from './pages/ClientSignup';
import ClientDashboard from './pages/ClientDashboard';
import VerifyEmail from './pages/VerifyEmail';
import VerifyScore from './pages/VerifyScore';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import SecurityPolicy from './pages/SecurityPolicy';
import CompliancePage from './pages/CompliancePage';
import AboutPage from './pages/AboutPage';
import AILabPage from './pages/AILabPage';
import CareersPage from './pages/CareersPage';
import BlogPage from './pages/BlogPage';
import PressPage from './pages/PressPage';
import ServicesPage from './pages/ServicesPage';
import IncidentResponsePage from './pages/IncidentResponsePage';
import VulnerabilityAssessmentPage from './pages/VulnerabilityAssessmentPage';
import ComplianceReadinessPage from './pages/ComplianceReadinessPage';
import DataProtectionAuditPage from './pages/DataProtectionAuditPage';
import NetworkHardeningPage from './pages/NetworkHardeningPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/client/login" element={<ClientLogin />} />
      <Route path="/client/signup" element={<ClientSignup />} />
      <Route path="/client/forgot-password" element={<ForgotPassword />} />
      <Route path="/client/reset-password" element={<ResetPassword />} />
      <Route path="/client/dashboard" element={<ClientDashboard />} />
      <Route path="/client/verify-email" element={<VerifyEmail />} />
      <Route path="/verify/:token" element={<VerifyScore />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/terms-of-service" element={<TermsOfService />} />
      <Route path="/security" element={<SecurityPolicy />} />
      <Route path="/compliance" element={<CompliancePage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/ai-lab" element={<AILabPage />} />
      <Route path="/careers" element={<CareersPage />} />
      <Route path="/blog" element={<BlogPage />} />
      <Route path="/press" element={<PressPage />} />
      <Route path="/services" element={<ServicesPage />} />
      <Route path="/services/incident-response" element={<IncidentResponsePage />} />
      <Route path="/services/vulnerability-assessment" element={<VulnerabilityAssessmentPage />} />
      <Route path="/services/compliance-readiness" element={<ComplianceReadinessPage />} />
      <Route path="/services/data-protection-audit" element={<DataProtectionAuditPage />} />
      <Route path="/services/network-hardening" element={<NetworkHardeningPage />} />
    </Routes>
  );
}

export default App;
