import { Sidebar } from "@/components/layout/Sidebar";
import { TabBar } from "@/components/layout/TabBar";
import { TabContent } from "@/components/layout/TabContent";
import { ClientProviders } from "@/components/layout/ClientProviders";

export default function AdminLayout({
  children: _children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClientProviders>
      <div className="h-screen flex flex-row overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TabBar />
          <TabContent />
        </div>
      </div>
    </ClientProviders>
  );
}
