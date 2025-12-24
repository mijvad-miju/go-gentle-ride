import React from 'react';
import { TrendingUp, Calendar } from 'lucide-react';

interface EarningsCardProps {
  todayEarnings: number;
  weeklyEarnings: number;
  tripsToday: number;
  tripsWeek: number;
}

const EarningsCard: React.FC<EarningsCardProps> = ({
  todayEarnings,
  weeklyEarnings,
  tripsToday,
  tripsWeek,
}) => {
  return (
    <div className="card-elevated p-5 space-y-4">
      {/* Today's earnings - prominent */}
      <div className="text-center p-6 bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl">
        <p className="text-sm font-medium text-muted-foreground mb-1">Today's Earnings</p>
        <p className="text-4xl font-bold text-primary">₹{todayEarnings.toLocaleString()}</p>
        <div className="flex items-center justify-center gap-2 mt-2 text-success">
          <TrendingUp className="w-4 h-4" />
          <span className="text-sm font-medium">{tripsToday} trips completed</span>
        </div>
      </div>
      
      {/* Weekly summary */}
      <div className="flex items-center justify-between p-4 bg-muted rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-secondary/15 rounded-full flex items-center justify-center">
            <Calendar className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">This Week</p>
            <p className="text-lg font-bold text-foreground">₹{weeklyEarnings.toLocaleString()}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Trips</p>
          <p className="text-lg font-bold text-foreground">{tripsWeek}</p>
        </div>
      </div>
    </div>
  );
};

export default EarningsCard;
