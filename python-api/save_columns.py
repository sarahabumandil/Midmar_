"""
Script to save the training columns for the model
Run this after training to save the column structure
"""
import pickle
import pandas as pd

# This should match the columns used during training
# You'll need to run this after training with your actual data
# For now, this is a template

# Example: Load your training data
# new_player_raw = ... (your training dataframe)
# X_columns = new_player_raw.drop(['Market Value Euros'], axis=1)
# columns_list = X_columns.columns.tolist()

# Save columns
# with open('models/training_columns.pkl', 'wb') as f:
#     pickle.dump(columns_list, f)

print("Update this script with your actual training columns and run it to save them.")
