import mongoose from 'mongoose';

const routeSafetyCacheSchema = new mongoose.Schema(
    {
        cacheKey: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        payload: {
            type: mongoose.Schema.Types.Mixed,
            required: true
        },
        expiresAt: {
            type: Date,
            required: true
        }
    },
    { timestamps: true }
);

// TTL index: documents are removed by Mongo once expiresAt is in the past.
routeSafetyCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RouteSafetyCache = mongoose.model('RouteSafetyCache', routeSafetyCacheSchema);

export default RouteSafetyCache;
