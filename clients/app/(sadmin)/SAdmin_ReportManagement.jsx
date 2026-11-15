import React from "react";
import SAdmin_Layout from "../../components/SAdmin_Compo/SAdmin_Layout";
import RecordManagementPage from "../../components/Admin_compo/RecordManagementPage";

export default function SAdmin_ReportManagement() {
  return <RecordManagementPage Layout={SAdmin_Layout} superAdmin />;
}
