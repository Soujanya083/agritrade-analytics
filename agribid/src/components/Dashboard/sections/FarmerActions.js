import React from 'react';

const FarmerActions = ({ activeTab, isFarmer, setActiveTab, setShowUploadForm }) => (
  (
    isFarmer &&
      activeTab === 'dashboard' && (

        <section className="farmer-actions">

          <button
            className="action-btn green"
            onClick={() => {
              setActiveTab('upload');
              setShowUploadForm(true);
            }}
          >
            Upload New Crop
          </button>

          <button
            className="action-btn purple"
            onClick={() =>
              setActiveTab('companion')
            }
          >
            Companion Planting Guide
          </button>

        </section>

      )
  ) || null
);

export default FarmerActions;
