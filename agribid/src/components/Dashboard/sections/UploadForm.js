import React from 'react';

const UploadForm = ({ activeTab, addListing, handleUploadChange, isFarmer, showUploadForm, uploadData }) => (
  (
    (showUploadForm ||
      activeTab === 'upload') &&
      isFarmer && (

        <section className="upload-form-wrap">

          <form
            className="upload-form"
            onSubmit={addListing}
          >

            <input
              name="cropName"
              value={uploadData.cropName}
              onChange={handleUploadChange}
              placeholder="Crop Name"
              required
            />

            <input
              name="variety"
              value={uploadData.variety}
              onChange={handleUploadChange}
              placeholder="Variety"
              required
            />

            <input
              name="quantityKg"
              type="number"
              min="1"
              value={uploadData.quantityKg}
              onChange={handleUploadChange}
              placeholder="Quantity (kg)"
              required
            />

            <input
              name="location"
              value={uploadData.location}
              onChange={handleUploadChange}
              placeholder="Location"
            />

            <input
              name="harvestedDate"
              value={uploadData.harvestedDate}
              onChange={handleUploadChange}
              placeholder="Harvested Date"
            />

            <input
              name="basePrice"
              type="number"
              min="1"
              value={uploadData.basePrice}
              onChange={handleUploadChange}
              placeholder="Base Price (INR/kg)"
              required
            />

            <label className="upload-label">
              Upload Crop Image
            </label>

            <input
              name="imageFile"
              type="file"
              accept="image/*"
              onChange={handleUploadChange}
            />

            {uploadData.imageUrl && (
              <img
                className="upload-preview"
                src={uploadData.imageUrl}
                alt="Preview"
              />
            )}

            <select
              name="category"
              value={uploadData.category}
              onChange={handleUploadChange}
            >
              <option value="Grains">
                Grains
              </option>

              <option value="Vegetables">
                Vegetables
              </option>

              <option value="Fruits">
                Fruits
              </option>

              <option value="Leafy">
                Leafy crops
              </option>
            </select>

            <button
              type="submit"
              className="action-btn green"
            >
              Save Listing
            </button>

          </form>

        </section>

      )
  ) || null
);

export default UploadForm;
