import { Navigate } from "react-router-dom";
import { canAccessModule } from "../config/navigation";
import { homeForUser } from "../utils/access";

export default function ModuleAccess({ user, moduleId, children }) {
  return canAccessModule(user, moduleId)
    ? children
    : <Navigate to={homeForUser(user)} replace />;
}
