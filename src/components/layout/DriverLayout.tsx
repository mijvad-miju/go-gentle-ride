import React from 'react';
import { Outlet } from 'react-router-dom';
import BottomNav, { driverNavItems } from '../common/BottomNav';

const DriverLayout: React.FC = () => {
    return (
        <div className="min-h-screen bg-background flex flex-col overflow-hidden">
            <main className="flex-1 overflow-y-auto">
                <Outlet />
            </main>
            <BottomNav items={driverNavItems} />
        </div>
    );
};

export default DriverLayout;
